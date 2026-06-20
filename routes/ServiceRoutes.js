const express = require("express");
const router = express.Router();
const Service = require("../models/Service");

// 🟢 Create new service (boarding or grooming)
router.post("/", async (req, res) => {
  try {
    const { provider_id, name, type, price, description } = req.body;

    if (!provider_id || !name || !type || !price) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const service = new Service({ provider_id, name, type, price, description });
    const saved = await service.save();

    res.status(201).json({ success: true, message: "Service created", data: saved });
  } catch (err) {
    console.error("Error creating service:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 🟡 Get all services
router.get("/", async (req, res) => {
  try {
    const services = await Service.find().populate("provider_id", "name email");
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🟢 Get service by ID
router.get("/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: "Service not found" });
    res.json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✏️ Update service
router.put("/:id", async (req, res) => {
  try {
    const updated = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Service not found" });
    res.json({ success: true, message: "Service updated", data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ❌ Delete service
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Service.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Service not found" });
    res.json({ success: true, message: "Service deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
