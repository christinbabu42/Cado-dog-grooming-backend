const mongoose = require("mongoose");

const groomerBookingSchema = new mongoose.Schema(
  {
    service: { type: String, required: true },
    price: { type: Number, required: true },

    date: { type: String, required: false },
    time: { type: String, required: false },

    petName: { type: String, required: true },
    breed: { type: String, required: true },

    name: { type: String, required: true },
    phone: { type: String, required: true },

    address: { type: String, required: true },
    city: { type: String, required: true },

    // --- NEW FIELDS ---
    userLocation: {
      lat: Number,
      lng: Number
    },
    staffId: { type: String, required: true },
    staffName: { type: String, required: true },
    staffLocation: {
      lat: Number,
      lng: Number
    },
        // ✅ NEW FIELDS
    staffPhone: { type: String },
    staffAlternatePhone: { type: String },
    // ------------------


    distanceKm: Number,
    travelCharge: Number,
    finalAmount: Number,


    commissionPercent: { type: Number, default: 20 },
commissionAmount: { type: Number },
staffEarning: { type: Number },



    paymentMethod: { type: String, enum: ["Online", "Cash"], required: true },
    paymentId: { type: String },  
    paymentStatus: { type: String, default: "pending" },
        groomingStatus: {
      type: String,
      enum: ["pending", "waiting", "completed"], 
      default: "pending",
    },


     // ✅ PAYOUT FIELDS
    payoutStatus: { type: String, enum: ["pending", "processed"], default: "pending" },
    payoutId: { type: String },             // Razorpay payout ID
    payoutAmount: { type: Number },         // Amount actually paid
    payoutCurrency: { type: String },       // e.g., "INR"
    payoutFundAccount: { type: String },    // Fund account ID
    payoutCreatedAt: { type: Date },        // Timestamp of payout
  },
  
  { timestamps: true }
);

module.exports = mongoose.model("GroomerBooking", groomerBookingSchema);
