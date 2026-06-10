const express = require('express');
const authController = require('../controllers/authController');
const unitConversionController = require('../controllers/unitConversionController')
const router = express.Router();


router
    .route('/')
    .get(unitConversionController.getAllConversionUnit)
    .post(unitConversionController.createConversion);

router
.get(
  '/byPartAndUnit',
  unitConversionController.getConversionByPartAndUnit
);

router
    .route('/:id')
    //.get(unitController.getUnitById)
    //.put(unitController.updateUnitById)
    .delete(unitConversionController.deleteConversion);

module.exports = router;