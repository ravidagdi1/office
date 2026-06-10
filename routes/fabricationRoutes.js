const express = require('express');
const authController = require('../controllers/authController');
const fabricationController = require('../controllers/fabricationController.js')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,fabricationController.getFabrications)
  .post(authController.protect,fabricationController.initiateTrade);

router
  .route('/trade/recived')
  .post(authController.protect,fabricationController.completeTrade)

router
  .route('/:id')
  .put(authController.protect,authController.restrictTo("superAdmin"),fabricationController.updateFabrication)
  .delete(authController.protect,authController.restrictTo("superAdmin"),fabricationController.deleteFabrication);

  router
  .route('/report')
  .post(authController.protect,fabricationController.fabricationReport)

module.exports = router ;