const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  dogStay: { type: mongoose.Schema.Types.ObjectId, ref: 'DogStay', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },// Added host reference
  reviewText: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  photo: { type: String },
  approved: { type: Boolean, default: true },
    // ✅ NEW
  hostResponse: {
    text: String,
    respondedAt: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Review', reviewSchema);
