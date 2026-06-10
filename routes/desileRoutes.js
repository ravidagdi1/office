const express = require('express');
const authController = require('../controllers/authController');
const desileItemController = require('../controllers/desileController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,desileItemController.getAllDesileItem)
  .post(authController.protect,authController.restrictTo('storeKeeper'),desileItemController.submitRequistForDesile);

// router
//   .route('/store/:storeId')
//   .get(authController.protect,desileItemController.getAlldesileItemOfStore)


router
  .route('/:id')
  .get(authController.protect,authController.restrictTo("storeKeeper,admin"),desileItemController.getDesileItem)
  .put(authController.protect,authController.restrictTo("storeKeeper,admin"),desileItemController.updateDesileItem)
  .delete(authController.protect,authController.restrictTo("storeKeeper"),desileItemController.deleteDesileItem);

module.exports = router ;