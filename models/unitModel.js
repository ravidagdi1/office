
const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
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



const Unit = mongoose.model('Unit', unitSchema);

module.exports = Unit;
