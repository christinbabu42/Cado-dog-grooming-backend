const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroomingStaff",
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["pending", "processed", "failed"],
      default: "pending",
    },
    payoutId: { type: String },          // Razorpay / sandbox payout ID
    fundAccount: { type: String },       // Fund account used
    bookings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GroomerBooking",
      },
    ],
    createdAt: { type: Date, default: Date.now },
    processedAt: { type: Date },         // When payout completed
    notes: { type: String },             // Optional notes
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payout", payoutSchema);
