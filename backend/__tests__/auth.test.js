const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Set test environment
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.SESSION_TIMEOUT = '1h';
process.env.DB_TYPE = 'sqlite';
process.env.NODE_ENV = 'test';

// We need to set up a test database before importing routes
// Use in-memory SQLite for tests
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let app;
let mockDb;
let testToken;
let adminUserId;

// Create a fresh in-memory database for tests
beforeAll(async () => {
  // Create in-memory SQLite DB
  mockDb = new sqlite3.Database(':memory:');
  
  // Promisify
  mockDb.allAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
    });
  };
  mockDb.getAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
    });
  };
  mockDb.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function(err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
    });
  };
  
  // Dialect helpers for testing compatibility
  mockDb.helpers = {
    now: () => 'CURRENT_TIMESTAMP',
    date: (col) => `DATE(${col}, 'localtime')`,
    groupConcat: (col) => `GROUP_CONCAT(${col})`
  };
  
  // Create tables
  await mockDb.runAsync(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'empleado',
    nombre_completo TEXT,
    email TEXT,
    activo BOOLEAN DEFAULT 1,
    ultimo_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  await mockDb.runAsync(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Create test admin user
  const hashedPassword = await bcrypt.hash('testpassword123', 10);
  const result = await mockDb.runAsync(
    'INSERT INTO usuarios (username, password_hash, role, nombre_completo, email) VALUES (?, ?, ?, ?, ?)',
    ['testadmin', hashedPassword, 'admin', 'Test Admin', 'admin@test.com']
  );
  adminUserId = result.lastID;
  
  // Mock the database module using the prefix 'mock'
  jest.mock('../config/database', () => mockDb);
  
  // Mock email service
  jest.mock('../utils/emailService', () => ({
    sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
    verifyEmailConfig: jest.fn().mockResolvedValue({ success: true })
  }));
  
  // Create test Express app
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  
  const authRoutes = require('../routes/authRoutes');
  app.use('/api/auth', authRoutes);
});

afterAll((done) => {
  if (mockDb) {
    mockDb.close(() => done());
  } else {
    done();
  }
});

describe('Auth Routes', () => {
  
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testadmin', password: 'testpassword123' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.username).toBe('testadmin');
      expect(res.body.user.role).toBe('admin');
      
      // Should set httpOnly cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('token=');
      expect(cookies[0]).toContain('HttpOnly');
      
      testToken = res.body.token;
    });
    
    it('should reject invalid username', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'testpassword123' });
      
      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
    
    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testadmin', password: 'wrongpassword' });
      
      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
    
    it('should reject empty credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      
      expect(res.statusCode).toBe(400);
    });
  });
  
  describe('GET /api/auth/verify', () => {
    it('should verify valid token from cookie', async () => {
      const res = await request(app)
        .get('/api/auth/verify')
        .set('Cookie', [`token=${testToken}`]);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.user.username).toBe('testadmin');
    });
    
    it('should verify valid token from Authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${testToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.valid).toBe(true);
    });
    
    it('should reject request without token', async () => {
      const res = await request(app)
        .get('/api/auth/verify');
      
      expect(res.statusCode).toBe(401);
    });
    
    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(res.statusCode).toBe(403);
    });
  });
  
  describe('POST /api/auth/register', () => {
    it('should register new user (admin only)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Cookie', [`token=${testToken}`])
        .send({
          username: 'newemployee',
          password: 'employee123',
          nombre_completo: 'New Employee',
          email: 'employee@test.com'
        });
      
      expect(res.statusCode).toBe(201);
      expect(res.body.user.username).toBe('newemployee');
      expect(res.body.user.role).toBe('empleado');
    });
    
    it('should reject duplicate username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Cookie', [`token=${testToken}`])
        .send({
          username: 'testadmin',
          password: 'duplicate123',
          nombre_completo: 'Duplicate',
          email: 'dup@test.com'
        });
      
      expect(res.statusCode).toBe(400);
    });
  });
  
  describe('POST /api/auth/logout', () => {
    it('should logout and clear cookie', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [`token=${testToken}`]);
      
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Logout exitoso');
    });
  });
  
  describe('POST /api/auth/forgot-password', () => {
    it('should accept valid email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'admin@test.com' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message');
    });
    
    it('should not leak info for non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' });
      
      // Should still return 200 to prevent email enumeration
      expect(res.statusCode).toBe(200);
    });
    
    it('should reject request without email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({});
      
      expect(res.statusCode).toBe(400);
    });
  });
  
  describe('POST /api/auth/reset-password', () => {
    it('should reject invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'invalid-token', password: 'newpassword123' });
      
      expect(res.statusCode).toBe(400);
    });
    
    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'some-token', password: '12345' });
      
      expect(res.statusCode).toBe(400);
    });
  });
  
  describe('Token Blacklist', () => {
    it('should reject blacklisted token after logout', async () => {
      // Login to get a fresh token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testadmin', password: 'testpassword123' });
      
      const freshToken = loginRes.body.token;
      
      // Logout (blacklists the token)
      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [`token=${freshToken}`]);
      
      // Try to use the blacklisted token
      const verifyRes = await request(app)
        .get('/api/auth/verify')
        .set('Cookie', [`token=${freshToken}`]);
      
      expect(verifyRes.statusCode).toBe(403);
    });
  });
});
