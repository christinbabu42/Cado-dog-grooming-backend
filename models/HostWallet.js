const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  balance: { type: Number, default: 0 },

  // transaction logs
  transactions: [
    {
      amount: Number,
      type: { type: String, enum: ["credit", "debit"] },
      description: String,
      createdAt: { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model("Wallet", walletSchema);
