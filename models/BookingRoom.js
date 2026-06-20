const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  // -----------------------------
  // Existing fields (UNCHANGED)
  // -----------------------------
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  roomName: { type: String, required: true },

  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  numDogs: { type: Number, default: 1 },

  fullName: { type: String, required: true },
  email: { type: String, required: true },
  mobile: { type: String, required: true },

  pricePerDay: { type: Number, required: true }, // base price (X)
  additionalPetCharge: { type: Number, default: 0 },
  couponDiscount: { type: Number, default: 0 },
  instantDiscount: { type: Number, default: 0 },
  taxRate: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true }, // what user paid

  paymentMethod: { type: String, enum: ["Card", "UPI", "Wallet", "Cash"], default: "Card" },
  paymentId: { type: String },
  paymentStatus: { type: String, enum: ["paid", "pending", "refunded"], default: "pending" },

  bookingStatus: { type: String, enum: ["active", "cancelled", "completed"], default: "active" },

  // -----------------------------
  // ✅ NEW: PRICING SNAPSHOT (SAFE ADD)
  // -----------------------------
pricingBreakup: {
  fakePricePerDay: { type: Number, immutable: true },
  userPricePerDay: { type: Number, immutable: true },
  websiteCommissionPerDay: { type: Number, immutable: true },
  hostPricePerDay: { type: Number, immutable: true }
},
totals: {
  nights: { type: Number },
  totalCommission: { type: Number },
  totalHostEarning: { type: Number}
},
commissionPaid: {
  type: Boolean,
  default: false
},
commissionPaidAt: {
  type: Date
},


  createdAt: { type: Date, default: Date.now }

}, { versionKey: false });

module.exports = mongoose.model("BookingRoom", bookingSchema);
