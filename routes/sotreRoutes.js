const express = require('express');
const authController = require('../controllers/authController');
const storeController = require('../controllers/storeController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,storeController.getAllStore)
  .post(authController.protect,authController.restrictTo('superAdmin'),storeController.createStore);

router
  .route('/:id')
  .get(authController.protect,storeController.getStoreById)
  .put(authController.protect,authController.restrictTo('superAdmin'),storeController.updateStoreById)
  .delete(authController.protect,authController.restrictTo('superAdmin'),storeController.deleteStoreById);

module.exports = router ;