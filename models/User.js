const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  googleId: { type: String, unique: true, sparse: true }, // ⚡ sparse allows null
  phone: String,
  role: { type: String, enum: ["owner","grstaff","gradmin", "host", "admin", "superadmin"], default: "owner" },
  walletBalance: { type: Number, default: 0 },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  profilePic: String,
  address: { type: String },
  bankDetails: {
  accountHolder: String,
  bankName: String,
  ifsc: String,
  accountNumber: String,
},

location: {
  address: String,
  lat: Number,
  lng: Number},
  country: String,
    // 🔥 NEW: Location (Swiggy style)
  // location: {
  //   address: String,
  //   lat: Number,
  //   lng: Number
  // },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
