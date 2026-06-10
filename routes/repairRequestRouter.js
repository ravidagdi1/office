const express = require('express');
const authController = require('../controllers/authController');
const repairController = require('../controllers/repairController')
const router = express.Router();


router
  .route('/')
  .get(authController.protect,repairController.getRequest)

router
  .route('/newSubmitRepairRequest')
  .post(authController.protect,authController.restrictTo('admin','storeKeeper'),repairController.newSubmitRepairRequest)


module.exports = router ;