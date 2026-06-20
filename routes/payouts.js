const express = require("express");
const axios = require("axios");
const auth = require("../middlewares/auth");
const GroomingStaff = require("../models/GroomingStaff");
const GroomerBooking = require("../models/GroomerBooking");
const Payout = require("../models/Payout"); // new schema

const router = express.Router();

// Razorpay test credentials from .env
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// ---------------------------------------------------
// Helper: Create Contact in Razorpay Test Mode
// ---------------------------------------------------
async function createRazorpayContact(staff) {
  const contactNumber = staff.phone?.replace(/\D/g, "");
  if (!contactNumber || contactNumber.length < 8) {
    throw new Error(
      `Invalid phone number for Razorpay: ${staff.phone}. Must include country code.`
    );
  }

  const razorpayContactNumber = staff.phone.startsWith("+") ? staff.phone : "+91" + contactNumber;

  const response = await axios.post(
    "https://api.razorpay.com/v1/contacts",
    {
      name: staff.fullName,
      email: staff.email || "test@groomer.com",
      contact: razorpayContactNumber,
      type: "employee",
      reference_id: staff._id.toString(),
    },
    { auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET } }
  );

  return response.data;
}

// ---------------------------------------------------
// Helper: Create Fund Account in Razorpay Test Mode
// ---------------------------------------------------
async function createRazorpayFundAccount(contactId, staff) {
  const response = await axios.post(
    "https://api.razorpay.com/v1/fund_accounts",
    {
      account_type: "bank_account",
      bank_account: {
        name: staff.fullName,
        ifsc: staff.bankDetails?.ifsc || "TEST0001",
        account_number: staff.bankDetails?.accountNumber || "0000000001",
      },
      contact_id: contactId,
    },
    { auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET } }
  );

  return response.data;
}

// ---------------------------------------------------
// Helper: Simulate Payout (sandbox mode)
// ---------------------------------------------------
async function triggerSandboxPayout(fundAccountId, amount) {
  return {
    id: "payout_mock_" + Date.now(),
    status: "processed",
    amount, // in rupees
    fund_account: fundAccountId,
    currency: "INR",
    createdAt: new Date(),
  };
}

// ---------------------------------------------------
// Route: Pay Groomer & Save Payout Info (Only in Payout Schema)
// ---------------------------------------------------
router.post("/pay-groomer/:staffId", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0)
      return res.status(400).json({ success: false, message: "Invalid payout amount" });

    const staff = await GroomingStaff.findById(req.params.staffId);
    if (!staff) return res.status(404).json({ success: false, message: "Staff not found" });

    staff.bankDetails = staff.bankDetails || {};

    // 1️⃣ Create Razorpay contact if missing
    if (!staff.bankDetails.razorpayContactId) {
      const contact = await createRazorpayContact(staff);
      staff.bankDetails.razorpayContactId = contact.id;
      await staff.save();
      console.log("✅ Razorpay contact created:", contact.id);
    }

    // 2️⃣ Create Fund Account if missing
    if (!staff.bankDetails.razorpayFundId) {
      const fundAccount = await createRazorpayFundAccount(
        staff.bankDetails.razorpayContactId,
        staff
      );
      staff.bankDetails.razorpayFundId = fundAccount.id;
      await staff.save();
      console.log("✅ Razorpay fund account created:", fundAccount.id);
    }

    // 3️⃣ Trigger Sandbox Payout
    const payout = await triggerSandboxPayout(staff.bankDetails.razorpayFundId, amount);
    console.log("🧪 Sandbox payout simulated:", payout);

    // 4️⃣ Get all pending bookings for this staff
    const bookings = await GroomerBooking.find({
      staffId: staff._id.toString(),
      paymentStatus: "paid",
      payoutStatus: { $ne: "processed" }
    });

    const bookingIds = bookings.map(b => b._id);

    // 5️⃣ Save payout in Payout schema
    const payoutRecord = await Payout.create({
      staffId: staff._id,
      amount,
      currency: payout.currency,
      status: payout.status,
      payoutId: payout.id,
      fundAccount: payout.fund_account,
      bookings: bookingIds,
      processedAt: new Date(),
    });

    // 6️⃣ Mark bookings as processed
    await GroomerBooking.updateMany(
      { _id: { $in: bookingIds } },
      {
        $set: {
          payoutStatus: "processed",
          payoutId: payout.id,
          payoutAmount: amount,
          payoutCurrency: payout.currency,
          payoutFundAccount: payout.fund_account,
          payoutCreatedAt: new Date(),
        },
      }
    );

    res.json({ success: true, payout: payoutRecord });

  } catch (err) {
    console.error("🔥 Payout error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message:
        err.response?.data?.error?.description || err.message || "Failed to send payout",
    });
  }
});


// GET all payouts
router.get("/all", auth, async (req, res) => {
  try {
    const payouts = await Payout.find()
      .populate("staffId", "fullName email phone bankDetails") // populate staff info
      .populate("bookings"); // optional: populate bookings if needed

    res.json({ success: true, payouts });
  } catch (err) {
    console.error("Failed to fetch payouts:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------
// GET STAFF PAYOUT DASHBOARD DATA (FROM PAYOUT SCHEMA)
// ---------------------------------------------------
router.get("/staff/summary", auth, async (req, res) => {
  try {
    if (req.user.role !== "grstaff") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // 1️⃣ Find GroomingStaff using logged-in user
    const staff = await GroomingStaff.findOne({
      staffID: req.user.mongoId
    });

    if (!staff) {
      return res.status(404).json({ success: false, message: "Staff profile not found" });
    }

    // 2️⃣ Available withdrawal (UNPAID BOOKINGS)
    const unpaidBookings = await GroomerBooking.find({
      staffId: staff._id.toString(),
      paymentStatus: "paid",
      payoutStatus: { $ne: "processed" }
    });

    const availableForWithdrawal = unpaidBookings.reduce(
      (sum, b) => sum + (b.staffEarning || 0),
      0
    );

    // 3️⃣ Payout history (FROM PAYOUT SCHEMA ONLY)
    const payouts = await Payout.find({ staffId: staff._id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      availableForWithdrawal,
      payouts
    });

  } catch (err) {
    console.error("Payout summary error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



module.exports = router;
