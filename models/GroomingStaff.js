const mongoose = require("mongoose");

const groomingStaffSchema = new mongoose.Schema({
     // 🔗 SAME AS USER _id
    staffID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },

  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  placeAddress: { type: String, required: true, lowercase: true, trim: true },
    // ✅ ADD THIS
  location: {
    lat: Number,
    lng: Number
  },
  alternatePhone: { type: String },
  experience: { type: String, required: true },
  coverLetter: { type: String, required: true },
  skills: { type: [String], default: [] },
  idProof: { type: String, required: true },
  bankDetails: {
  accountHolder: { type: String },
  bankName: { type: String },
  ifsc: { type: String },
  accountNumber: { type: String },
},

  submissionDate: { type: Date, default: Date.now },

  // ✅ Add approval status field
  isApproved: { type: Boolean, default: false },
});

module.exports = mongoose.model("GroomingStaff", groomingStaffSchema);
