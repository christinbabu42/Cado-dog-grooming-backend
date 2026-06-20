const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");

// 🟡 Get all transactions
router.get("/", async (req, res) => {
  try {
    const transactions = await Transaction.find().populate("booking_id", "status amount");
    res.json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🟢 Get transactions by user
router.get("/user/:userId", async (req, res) => {
  try {
    const transactions = await Transaction.find({ user_id: req.params.userId })
      .sort({ created_at: -1 })
      .populate("booking_id", "status amount");
    res.json({ success: true, data: transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
