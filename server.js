// -----------------------------------------------------------------------------
// 🌟 Dog Stay Backend - Main Server File
// -----------------------------------------------------------------------------

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require("express-session");
const cookieParser = require("cookie-parser");

require('dotenv').config();

// -----------------------------------------------------------------------------
// 📦 Route Imports
// -----------------------------------------------------------------------------
const adminRoutes = require('./routes/adminRoutes');
const adminDogStayRoutes = require('./routes/adminDogStayRoutes');
const groomingStaffRoutes = require("./routes/groomingStaff");
const BookingRoomRoutes = require("./routes/BookingRoomRoutes");
const TransactionRoutes = require("./routes/TransactionRoutes");
const googleAuthRouter = require('./routes/googleAuth');
const userRoutes = require("./routes/userRoute");


// -----------------------------------------------------------------------------
// 🚀 App Initialization
// -----------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;

// -----------------------------------------------------------------------------
// 🔐 CORS Configuration
// -----------------------------------------------------------------------------
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:5173",
        "https://cado-dog-grooming-frontend.vercel.app"
      ];

      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);


// -----------------------------------------------------------------------------
// 🔗 MongoDB Connection
// -----------------------------------------------------------------------------
const MONGODB_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('🐶 MongoDB connection established successfully.'))
  .catch(err => {
    console.error('❌ MongoDB connection error. Check URI and Network access:', err);
  });

// -----------------------------------------------------------------------------
// 🧰 Body Parser Middleware
// -----------------------------------------------------------------------------
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, parameterLimit: 100000 }));

// ⭐ ADD THIS
app.use(
  session({
    secret: "supersecretkey123",
    resave: false,
    saveUninitialized: true,
    cookie: {
    secure: true,
    httpOnly: true,
    sameSite: "none"
  }
  })
);
// -----------------------------------------------------------------------------
// 📁 Static Files
// -----------------------------------------------------------------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//for-review
app.use('/uploads', express.static('uploads'));


// -----------------------------------------------------------------------------
// 📌 API Routes
// -----------------------------------------------------------------------------

// Google Auth Route
app.use('/auth/google', googleAuthRouter);

// User Profile
app.use("/api/user", userRoutes);

// Admin
app.use('/api/admin', adminRoutes);

// Admin Dog Stay
app.use('/api/admin/dogstay', adminDogStayRoutes);

// Booking
app.use("/api/roombookings", BookingRoomRoutes);

// Transactions
app.use("/api/transactions", TransactionRoutes);

// Grooming Staff
app.use("/api/grooming-staff", groomingStaffRoutes);

//Groomer-Booking
app.use("/api/groomer", require("./routes/groomerBookingRoutes"));

//for admin booking
app.use("/api/admin/groomer", require("./routes/adminGroomerBookingRoutes"));


//payment
app.use("/api/payment", require("./routes/paymentRoutes"));

//dashboard
app.use("/api/admin/dashboard", require("./routes/AdminDashboard"));

//review
app.use('/api/reviews', require("./routes/reviewRoutes"));


//host-Review
app.use("/api/host-reviews", require("./routes/hostReviews"));

app.use("/api/hostBookings", require("./routes/hostBookingRoutes"));

app.use("/api/host-details", require("./routes/hostDetailsRoutes"));

app.use("/api/rooms", require("./routes/hostRoomsRoutes"));

app.use("/api/wallet", require("./routes/HostWalletRoutes"));

app.use("/api/hosts", require("./routes/hostRoutes"));

app.use("/api/host/commission", require("./routes/hostCommissionRoute"));

app.use("/api/admin", require("./routes/adminCommissionRoutes"));


// groomers-earnings 
app.use("/api/groomer-Earnings", require("./routes/groomerEarnings"));

//payout
app.use("/api/payout/grstaff" , require("./routes/payouts"));




// -----------------------------------------------------------------------------
// 🏥 Health Check Endpoint
// -----------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: '🐾 Dog-Stay Backend API is running!'
  });
});

// -----------------------------------------------------------------------------
// ❌ 404 - Route Not Found
// -----------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route Not Found: ${req.method} ${req.originalUrl}`
  });
});

// -----------------------------------------------------------------------------
// ⚠️ Global Error Handler
// -----------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    message: 'A global server error occurred',
    error: process.env.NODE_ENV === 'production' ? null : err.message
  });
});

// -----------------------------------------------------------------------------
// 🚀 Start Server
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🐶 Server running successfully on port ${PORT}`);
  console.log(`🌐 Base API URL: http://localhost:${PORT}/`);
  console.log(`📂 Uploads URL: http://localhost:${PORT}/uploads/`);
});
