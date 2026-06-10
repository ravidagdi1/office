const mongoose = require('mongoose');

const FabricationSchema = new mongoose.Schema({
  storeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Store', 
    required: true 
},
  fabricationNo: {
    type:Number,
    required: true,
    unique: true
  },
  sentItems: [
    {
      inventoryId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Inventory',
         required: true
     },
      quantity: { 
        type: Number, 
        required: true 
    },
    }
  ],
  receivedItem: [
    {
      inventoryId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Inventory',
         required: true
     },
      quantity: { 
        type: Number, 
        required: true 
    },
    }
  ],
  status: { 
    type: String, 
    enum: ['initiated', 'completed','recived'], 
    default: 'initiated' 
},
  fabricationDate: { 
    type: Date, 
    default: Date.now 
},
},{
    timestamps:true,
  });

FabricationSchema.pre(/^find/, function(next) {
  if (this.getOptions().skipPopulate) return next();
  this.populate({
    path: 'sentItems.inventoryId',
    select: '-__v -active -id'
  }).populate({
    path: 'receivedItem.inventoryId',
    select: '-__v '
  }).populate({
    path: 'storeId',
    select: 'name'
  })

  next();
});

  


module.exports = mongoose.model('Fabrication', FabricationSchema);
