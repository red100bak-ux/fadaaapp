const qr = require('C:/Users/dr/AppData/Roaming/npm/node_modules/qrcode');
qr.toFile('C:/Users/dr/Desktop/expo_qr.png', 'exp://192.168.0.100:8081', {
  width: 400,
  margin: 2,
}, (e) => {
  if (e) console.error(e);
  else console.log('QR saved to Desktop: expo_qr.png');
});
