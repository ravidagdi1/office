const express = require('express');
const router = express.Router();
const { sendWhatsApp } = require("../services/whatsappService");
const quotationController = require('../controllers/quotationController')
const authController=require('../controllers/authController')



router
  .route('/send-whatsapp')
  .post( authController.protect,authController.restrictTo('superAdmin'),quotationController.sendQuotationWhatsApp);

 

router
  .route("/replies")
  .get(
    authController.protect,
    authController.restrictTo("superAdmin"),
    quotationController.getRepliesByStatus
  );

router.get(
  "/replies-grouped",
  authController.protect,
  authController.restrictTo("superAdmin"),
  quotationController.getGroupedApprovedReplies
);

router.patch(
  "/approve-quote",
  authController.protect,
  authController.restrictTo("superAdmin"),
  quotationController.approveGroupedQuote
);

router.patch(
  "/approve-quote-bulk",
  authController.protect,
  authController.restrictTo("superAdmin"),
  quotationController.approveGroupedQuoteBulk
);


router.get(
  "/quotation-logs/:partNo",
  authController.protect,
  authController.restrictTo("superAdmin"),
  quotationController.getLogsByPartNo
);

router.post(
  "/manual-rate",
  authController.protect,
  authController.restrictTo("superAdmin"),
  quotationController.addManualQuotationRate
);

router.post(
  "/force-expire",
  authController.protect,
  authController.restrictTo("superAdmin"),
  quotationController.forceExpireRate
);

router.post(
  "/reactivate-rate",
  authController.protect,
  authController.restrictTo("superAdmin"),
  quotationController.reactivateRate
);





router.get("/twilio-test", async (req, res, next) => {
  try {
    const result = await sendWhatsApp({
      to: "918238090100", // number WITHOUT + or whatsapp:
      message: "Twilio credentials working ✅"
    });

    res.json({
      success: true,
      sid: result.sid
    });
  } catch (err) {
    next(err);
  }
});



module.exports = router;