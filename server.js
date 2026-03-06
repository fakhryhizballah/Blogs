require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const connectDB = require('./config/database');
const { injectUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser untuk membaca JWT dari HttpOnly cookie
app.use(cookieParser());

// Inject user JWT payload ke semua views & req.user
app.use(injectUser);

// Flash message via query string (tidak perlu session)
app.use((req, res, next) => {
  res.locals.flashError = req.query.error ? decodeURIComponent(req.query.error) : null;
  res.locals.flashSuccess = req.query.success ? decodeURIComponent(req.query.success) : null;
  next();
});

app.use('/', require('./routes/public'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Halaman Tidak Ditemukan' });
});

app.listen(PORT, () => {
  console.log('Server berjalan di http://localhost:' + PORT);
  console.log('Autentikasi: JWT via HttpOnly Cookie');
});