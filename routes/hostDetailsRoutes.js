const express = require("express");
const router = express.Router();
const Host = require("../models/User");

router.get("/:id", async (req, res) => {
  try {
    const host = await Host.findById(req.params.id)
      .select("-password");

    if (!host) {
      return res.status(404).json({ success: false, message: "Host not found" });
    }

    res.json({ success: true, host });

  } catch (err) {
    console.error("Host Details Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
