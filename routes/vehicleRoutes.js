const express = require('express');
const authController = require('../controllers/authController');
const vehicleController = require('../controllers/vehicleController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,vehicleController.getAllVehicle)
  .post(authController.protect,authController.restrictTo('superAdmin'),vehicleController.createVehicle);

router
  .route('/store/:storeId')
  .get(authController.protect,vehicleController.getAssetVehiclesByStore)


router
  .route('/:id')
  .get(authController.protect,authController.restrictTo("superAdmin,admin"),vehicleController.getVehicleById)
  .put(authController.protect,authController.restrictTo("superAdmin"),vehicleController.updateVehicleById)
  .delete(authController.protect,authController.restrictTo("superAdmin"),vehicleController.deleteVehicleById);



  router.post('/filter', vehicleController.getVehicleByStatusAndRentalStatus);

module.exports = router ;