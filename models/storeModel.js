const mongoose = require('mongoose');
const Counter=require('./counterModel.js')


const storeSchema = new mongoose.Schema({
  name:{
    type:String,
    lowercase: true,
    unique:true,
    required:[true,'Store must have a name!']
  },
  location:{
    type:String,
    lowercase: true,
    required:[true,'Store must have a location !']
  },
  status:{
    type: String,
      default:'active',
      enum: {
        values: ['active', 'inactive'],
        message: 'Status is either: active, inactive !'
      }
  },
  address: {
    street: { type: String, trim: true },
    city: { type: String,trim: true },
    state: { type: String,trim: true },
    pincode: { type: String,trim: true },
    country: { type: String,trim: true }
  },
  user:{
      type:mongoose.Schema.ObjectId,
      ref:'User',
   },
    storeCode: {
    type: String,
    unique: true
  }
});


// userSchema.pre(/^find/, function(next) {
//   // this points to the current query
//   this.find({ active: { $ne: false } });
//   next();
// });

// Pre-save hook to fetch the last storeCode and increment it
storeSchema.pre('save', async function (next) {
  if (this.isNew && !this.storeCode) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'storeCode' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.storeCode = String(counter.seq).padStart(4, '0'); // '0001', '0002', ...
  }
  next();
});




const Store = mongoose.model('Store', storeSchema);

module.exports = Store;
