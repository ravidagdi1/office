const Accessories = require('../models/accessoriesModel');

// Create a new accessory
exports.createAccessory = async (req, res) => {
  try {
    req.body.user = req.user;

    if (req.body.quantity !== undefined) {
      req.body.quantity = Number(req.body.quantity);
    }

    console.log("hdhdd", req.body);

    const accessory = await Accessories.create(req.body);

    res.status(201).json({
      status: 'success',
      data: {
        accessory,
      },
    });
  } catch (err) {
    res.status(400).json({
      status: 'fail',
      message: err.message,
    });
  }
};


// GET all accessories with populated associations (Asset, Store, and User)
exports.getAllAccessories = async (req, res) => {
    try {
        const accessories = await Accessories.find()
            .populate('asset')    // populate Asset reference
            .populate('store')    // populate Store reference
            .populate('user');    // populate User reference

        if (!accessories || accessories.length === 0) {
            return res.status(404).json({
                status: 'fail',
                message: 'No accessories found',
            });
        }

        res.status(200).json({
            status: 'success',
            data: {
                accessories,
            },
        });
    } catch (err) {
        console.error('Error fetching accessories:', err);
        res.status(500).json({
            status: 'error',
            message: 'Server error while fetching accessories',
        });
    }
};

// GET accessory by ID with populated associations
exports.getAccessoryById = async (req, res) => {
    try {
        const { id } = req.params;
        const accessories = await Accessories.find({ store: storeId })
            .populate('asset')    // populate Asset reference
            .populate('store')    // populate Store reference
            .populate('user');    // populate User reference

        if (!accessory) {
            return res.status(404).json({
                status: 'fail',
                message: 'No accessory found with that ID',
            });
        }

        res.status(200).json({
            status: 'success',
            data: {
                accessory,
            },
        });

    } catch (err) {
        console.error('Error fetching accessory:', err);
        res.status(500).json({
            status: 'error',
            message: 'Server error while fetching accessory',
        });
    }
};


// Update an accessory by ID
exports.updateAccessory = async (req, res) => {
  try {
    const accessory = await Accessories.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!accessory) {
      return res.status(404).json({
        status: 'fail',
        message: 'Accessory not found',
      });
    }
    res.status(200).json({
      status: 'success',
      data: {
        accessory,
      },
    });
  } catch (err) {
    res.status(400).json({
      status: 'fail',
      message: err.message,
    });
  }
};

// Delete an accessory by ID
exports.deleteAccessory = async (req, res) => {
  try {
    const accessory = await Accessories.findByIdAndDelete(req.params.id);
    if (!accessory) {
      return res.status(404).json({
        status: 'fail',
        message: 'Accessory not found',
      });
    }
    res.status(204).json({
      status: 'success',
      data: null,
    });
  } catch (err) {
    res.status(400).json({
      status: 'fail',
      message: err.message,
    });
  }
};
