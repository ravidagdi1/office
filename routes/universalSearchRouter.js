const express = require('express');
const authController = require('../controllers/authController');
const universalController = require('../controllers/universalController');
const router = express.Router();

router
  .route('/universal-search')
  .post( authController.protect,authController.restrictTo('superAdmin','director'),universalController.universalSearchController);



module.exports = router ;