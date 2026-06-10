const mongoose = require('mongoose');

const subcategorySchema = new mongoose.Schema({
  name: {
    type: String,
    lowercase: true,
    unique: true,
    required: [true, 'Sub category must have a name!']
  },
  status: {
    type: String,
    default: 'active',
    enum: {
      values: ['active', 'inactive'],
      message: 'Status must be either active or inactive!'
    }
  },
  isRefresher: {
    type: Boolean,
    default: false
  }
});



const Subcategory = mongoose.model('Subcategory', subcategorySchema);
module.exports = Subcategory;
