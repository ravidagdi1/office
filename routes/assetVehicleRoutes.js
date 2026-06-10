const express = require('express');
const router = express.Router();
const assetVehicleController = require('../controllers/assetVehicleController');

router.post('/createAssetVehicle', assetVehicleController.createAssetVehicle);
router.get('/getAllAssetVehicles', assetVehicleController.getAllAssetVehicles);
// ✅ Update (operators, status, avg, capacity)
router.patch('/:id', assetVehicleController.updateAssetVehicle);

module.exports = router;