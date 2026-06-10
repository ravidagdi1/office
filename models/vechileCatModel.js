
const mongoose = require('mongoose');

const VechileCategorySchema = new mongoose.Schema({
  name:{
    type:String,
    lowercase: true,
    unique:true,
    required:[true,'Category must have a name!']
  },
  status:{
    type: String,
      default:'active',
      enum: {
        values: ['active', 'inactive'],
        message: 'Status is either: active, inactive !'
      }
  }
});



const VechileCategory = mongoose.model('VechileCategory', VechileCategorySchema);

module.exports = VechileCategory;
