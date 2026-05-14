import React from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Button,
  Stack,
} from '@mui/material';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  ShoppingBag as BagIcon,
} from '@mui/icons-material';
import { useCart } from '../contexts/CartContext';
import { useNavigate } from 'react-router-dom';

const CartDrawer = ({ open, onClose }) => {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartCount } = useCart();
  const navigate = useNavigate();

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 400 }, p: 0 }
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'primary.main', color: 'white' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <BagIcon />
            <Typography variant="h6" fontWeight={700}>Tu Pedido ({cartCount})</Typography>
          </Stack>
          <IconButton onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
          {cart.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 10 }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Tu carrito está vacío.
              </Typography>
              <Button variant="outlined" onClick={onClose}>
                Volver a la tienda
              </Button>
            </Box>
          ) : (
            <List disablePadding>
              {cart.map((item) => (
                <React.Fragment key={item.id}>
                  <ListItem sx={{ py: 2, px: 0 }}>
                    <ListItemText
                      disableTypography
                      primary={
                        <Typography variant="subtitle1" fontWeight={700}>
                          {item.nombre}
                        </Typography>
                      }
                      secondary={
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="body2" color="primary.main" fontWeight={600} sx={{ mb: 1 }}>
                            ${item.precio.toLocaleString('es-CL')} c/u
                          </Typography>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <IconButton 
                              size="small" 
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              sx={{ border: '1px solid', borderColor: 'divider' }}
                            >
                              <RemoveIcon fontSize="small" />
                            </IconButton>
                            <Typography variant="body2" sx={{ width: 30, textAlign: 'center', fontWeight: 700 }}>
                              {item.quantity}
                            </Typography>
                            <IconButton 
                              size="small" 
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              sx={{ border: '1px solid', borderColor: 'divider' }}
                            >
                              <AddIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton edge="end" onClick={() => removeFromCart(item.id)} color="error" size="small">
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>

        {/* Footer */}
        {cart.length > 0 && (
          <Box sx={{ p: 3, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
              <Typography variant="h6" fontWeight={700}>Total:</Typography>
              <Typography variant="h6" fontWeight={700} color="primary.main">
                ${cartTotal.toLocaleString('es-CL')}
              </Typography>
            </Box>
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleCheckout}
              sx={{ 
                py: 1.5, 
                borderRadius: 50, 
                fontWeight: 700,
                boxShadow: '0 8px 16px rgba(212, 163, 115, 0.3)'
              }}
            >
              Confirmar Pedido
            </Button>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default CartDrawer;
