const express = require('express');
const authController = require('../controllers/authController');
const unitController = require('../controllers/unitController')
const router = express.Router();


router
  .route('/')
  .get(unitController.getAllUnit)
  .post(unitController.createUnit);

router
  .route('/:id')
  .get(unitController.getUnitById)
  .put(unitController.updateUnitById)
  .delete(unitController.deleteUnitById);

module.exports = router ;