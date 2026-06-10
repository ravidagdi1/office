
const Request = require('../models/requestedModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const Mrv = require('../models/mrvFormModel');
const DesileItem = require('../models/desileItem');

const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');


const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/img/requisitionform');
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.split('/')[1];
    cb(null, `product-${Date.now()}.${ext}`);
  }
});
// const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  
  if (file.mimetype.startsWith('image')) {
    console.log(file)
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

exports.uploadProductPhoto = upload.single('image');

exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // If no file is uploaded, skip this middleware

  const ext = 'jpeg'; // Convert the image format to jpeg
  const filename = `product-${Date.now()}.${ext}`; // Generate a new filename for the resized image

  // Use sharp to resize the image from the path
  await sharp(req.file.path)
    .toFormat(ext)
    .jpeg({ quality: 90 })
    .toFile(`public/img/requisitionform/${filename}`); // Save the resized image to disk

  req.body.fileName = filename; // Store the new filename in req.body.image for further processing
  fs.unlinkSync(req.file.path);
  next(); // Proceed to the next middleware
});

exports.submitRequistForDesile = catchAsync(async (req, res, next) => {
    const user = req.user;
    const items = req.body.items;

    console.log(user)
  
    for (const item of items) {
      const inventory = await Inventory.findById(item.inventory).populate('store');
  
      // Check if the item already has a status
      if (item.status) {
        return next(new AppError('This route is not for Status Change!'));
      }
  
      // Check if the requested quantity exceeds the allowed limit
      if (item.qtyRequired > inventory.qtyAuth - inventory.currentStock) {
        return next(new AppError('Qty required should be less than AuthQty.'));
      }
  
      // Create a new requisition request if not already created
      // const request = await Request.create({
      //   requisitionNo: Date.now(),
      //   store: inventory.store._id,
      //   user: req.user._id,
      //   status: 'adminSubmit',
      // });
  
      // // Create an MRV for the requisition
      // const mrv = await Mrv.create({
      //   mrvNo: request.requisitionNo,
      //   store: inventory.store._id,
      //   user: req.user._id,
      //   status: 'submit',
      // });
  
      const unique = Date.now()
      // Create a new DesileItem document
      await DesileItem.create({
        inventory: item.inventory,
        requisitionNo: unique,
        user: user._id,
        store: inventory.store._id,
        mrv: unique,
        qtyRequired: item.qtyRequired,
        approveQty: item.qtyRequired, // Assuming approval equals the requested quantity for now
        status: 'pending',
      });
    }
  
    // Send a success response
    res.status(200).json({
      status: 'success',
      message: 'Requisition and items have been submitted successfully.',
    });
  });
  

  exports.getDesileItem = factory.getOne(DesileItem);
  // exports.getAllDesileItem = factory.getAll(DesileItem);

  exports.getAllDesileItem = catchAsync(async (req,res,next)=>{

    const user = req.user;
    let filter = {};
  
    
      filter = {status:req.query.status ,store:req.query.store }
  
    console.log("filter",filter)
    const doc = await DesileItem.find(filter)
    console.log(doc)
    res.status(201).json({
      status: 'success',
      data: {
        data: doc
      }
    });
  })

  exports.deleteDesileItem = factory.deleteOne(DesileItem);

  // exports.updateDesileItem = factory.updateOne(DesileItem);

  exports.getAdminApproveDesileItem = catchAsync(async (req,res,next)=>{

  //  const user = req.user;
    let filter = {};
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ message: "Unauthorized" });

    // Verify Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    
    console.log(decoded)

      filter = {status:'approvedByAdmin'  }
  
    console.log("filter",filter)
    const doc = await DesileItem.find(filter)
    console.log(doc)
    res.status(201).json({
      status: 'success',
      data: {
        data: doc
      }
    });
  })

exports.updateDesileItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { approveQty, status } = req.body;
        const adminId = req.user.id; // Assuming admin ID is coming from auth middleware

        // Find the DesileItem record
        const desileItem = await DesileItem.findById(id).populate('user');

        if (!desileItem) {
            return res.status(404).json({ success: false, message: 'Desile Item not found' });
        }

        // Update the approval details
        desileItem.approveQty = approveQty;
        desileItem.approveBy = adminId;
        desileItem.adminRemark = status;
        desileItem.status = 'approvedByAdmin';

        await desileItem.save();

        // Generate a unique token (valid for a limited time)
        const token = jwt.sign(
            { id: desileItem._id, adminId },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        const approvalLink = `http://localhost:3000/super-admin/approve?token=${token}`;

        console.log(approvalLink)
        // Email configuration (Replace with your SMTP settings)
        const transporter = nodemailer.createTransport({
          service: 'Gmail',
          auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
          },
          tls: {
              rejectUnauthorized: false
          }
      });

        console.log(transporter)

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.SUPER_ADMIN_EMAIL,
            subject: 'Approval Required for Diesel Item',
            html: `
                <p>Hello Super Admin,</p>
                <p>An item has been approved by an admin and requires your final approval or modification.</p>
                <p>Click the link below to approve or modify:</p>
                <a href="${approvalLink}" target="_blank">Approve/Modify Item</a>
                <p>This link is valid for 24 hours.</p>
            `
        };

        // // Send email
        await transporter.sendMail(mailOptions);

        res.status(200).json({
            success: true,
            message: 'Approval email sent to super admin',
            data: desileItem
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

exports.updateAdminApproveDesileItem = async (req, res) => {
  try {
      const { id } = req.params;
      const { approveQty, status } = req.body;
      //const adminId = req.user.id; // Assuming admin ID is coming from auth middleware

      // Find the DesileItem record
      const desileItem = await DesileItem.findById(id).populate('user');

      if (!desileItem) {
          return res.status(404).json({ success: false, message: 'Desile Item not found' });
      }

      // Update the approval details
      desileItem.approveQty = approveQty;
      desileItem.adminRemark = status;
      desileItem.status = 'approved';

      await desileItem.save();


      res.status(200).json({
          success: true,
          message: 'Approval email sent to super admin',
          data: desileItem
      });

  } catch (error) {
      console.error(error);
      res.status(500).json({
          success: false,
          message: 'Server error',
          error: error.message
      });
  }
};
