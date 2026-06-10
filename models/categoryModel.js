
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name:{
    type:String,
    lowercase: true,
    unique:true,
    required:[true,'Store must have a name!']
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



const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
