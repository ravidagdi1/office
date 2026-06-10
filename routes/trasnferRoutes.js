const express = require('express');
const authController = require('../controllers/authController');
const trasnferController = require('../controllers/transferController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,authController.restrictTo('admin','storeKeeper','superAdmin'),trasnferController.getAllRequest)
  .post( authController.protect,authController.restrictTo('admin','storeKeeper'),trasnferController.uploadProductPhoto,trasnferController.resizeProductPhoto, trasnferController.createRequest);

    
router
  .route('/submit')
  .post(authController.protect,authController.restrictTo('admin','storeKeeper'),trasnferController.submitRequist)
router
  .route('/:id')
  .get(authController.protect,trasnferController.getInventoryItem)
  .patch(authController.protect,authController.restrictTo('admin','storeKeeper'),trasnferController.updateRequestItem)
  .delete(authController.protect,authController.restrictTo('admin','superAdmin'),trasnferController.deleteInventroyItem);

module.exports = router ;