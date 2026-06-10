const express = require('express');
const authController = require('../controllers/authController');
const mivController = require('../controllers/mivController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,authController.restrictTo('admin','storeKeeper','superAdmin'),mivController.getAllMiv)
  .post( authController.protect,authController.restrictTo('admin','storeKeeper'),mivController.uploadProductPhoto,mivController.resizeProductPhoto, mivController.createMiv);

  router 
  .route('/byStoreAndStatus')
  .get(authController.protect,authController.restrictTo('admin','storeKeeper','superAdmin'),mivController.getAllMivByStoreAndStatus)


  router
  .route('/submitmiv')
  .post(authController.protect,authController.restrictTo('admin','storeKeeper'),mivController.submitMiv)

   router
  .route('/newsubmitmiv')
  .post(authController.protect,authController.restrictTo('admin','storeKeeper'),mivController.newsubmitMiv)

    router
  .route('/submitwatermiv/')
  .post(authController.protect,authController.restrictTo('admin','storeKeeper'),mivController.submitWaterMiv)
router
  .route('/:id')
  .get(authController.protect,mivController.getSingleMiv)
  .patch(authController.protect,authController.restrictTo('admin','storeKeeper'),mivController.updateUsedItem)
  .delete(authController.protect,authController.restrictTo('superAdmin'),mivController.deleteMiv);

module.exports = router ;