const express = require("express");
const router = express.Router();
const qtyIncreaseRequestController = require('../controllers/qtyincreasePOController');

const authController = require(
    "../controllers/authController");

// ✅ CREATE REQUEST
router.post(
    "/create",
    authController.protect, authController.restrictTo('pomaker'),
    qtyIncreaseRequestController.createQtyIncreaseRequest
);

// ✅ GET QTY REQUESTS BY STATUS
router.get(
    "/dataByStatus",
     authController.protect, authController.restrictTo('pomaker','director','superAdmin'),
    qtyIncreaseRequestController.getQtyIncreaseRequests
);

// ✅ APPROVE / REJECT
router.patch(
    "/process",
    authController.protect,
    authController.restrictTo(
        'director'
    ),
    qtyIncreaseRequestController.processQtyIncreaseRequest
);


module.exports = router;