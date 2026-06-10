const Casting = require('../models/castingSchema');
const Inventory = require('../models/inventoryModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const AppError = require('../utils/appError');


exports.createCasting = catchAsync(async (req, res, next) => {
    const { RequestType, inventory, castingQty } = req.body;

    if (!RequestType || !inventory) {
        return next(new AppError('RequestType and Inventory ID are required', 400));
    }

    const qty = Number(castingQty) || 0;

    // Fetch inventory document
    const inventorydoc = await Inventory.findById(inventory);
    if (!inventorydoc) {
        return next(new AppError('Inventory Not found for Modification', 404));
    }

    let updateFields = {};

    if (RequestType === 'MRV') {
        let newTotalReceived = inventorydoc.totalRecive + qty;
        let newCurrentStock = inventorydoc.currentStock + qty;

        updateFields = {
            totalRecive: newTotalReceived,
            currentStock: newCurrentStock
        };

        req.body.totalRecive = {
            old: inventorydoc.totalRecive,
            new: newTotalReceived
        };

        req.body.currentStock = {
            old: inventorydoc.currentStock,
            new: newCurrentStock
        };

    } else if (RequestType === 'MIV') {
        let newMiv = inventorydoc.totalMiv + qty;
        let newCurrentStock = inventorydoc.currentStock - qty;

        updateFields = {
            totalMiv: newMiv,
            currentStock: newCurrentStock
        };

        req.body.totalMiv = {
            old: inventorydoc.totalMiv,
            new: newMiv
        };

        req.body.currentStock = {
            old: inventorydoc.currentStock,
            new: newCurrentStock
        };
    }


    // Perform update and casting creation in parallel
    const [updatedInventory, newCasting] = await Promise.all([
        Object.keys(updateFields).length > 0 ? Inventory.findByIdAndUpdate(inventory, updateFields, { new: true }) : null,
        Casting.create(req.body)
    ]);

    if (!newCasting) {
        return next(new AppError('Failed to create Casting record', 500));
    }

    res.status(201).json({
        status: 'success',
        data: {
            data: newCasting,
            message: "Successfully executed Casting record!"
        }
    });
});


exports.CastingReport = catchAsync(async (req, res, next) => {
    try {
        // Extract parameters from the request
        const { fromDate, toDate, status } = req.body;

        // Ensure 'fromDate' and 'toDate' are provided, and parse them into Date objects
        const from = fromDate ? new Date(fromDate) : new Date(); // Default to a very early date if not provided
        const to = toDate ? new Date(toDate) : new Date(); // Default to the current date if not provided

        // Validate dates
        if (isNaN(from) || isNaN(to)) {
            return next(new AppError('Invalid Date Formate', 404));
        }

        // Build the query
        const startOfDay = new Date(from).setHours(0, 0, 0, 0); // Start of the day
        const endOfDay = new Date(to).setHours(23, 59, 59, 999); // End of the day

        const query = {
            createdAt: { $gte: new Date(startOfDay), $lte: new Date(endOfDay) }, // Full-day range
            //status: { $in: ["recived", "rejected", "pending"] },
        };



        // Find items that match the query
        const castingData = await Casting.find(query)

        // Get the total count of records matching the query
        const totalCount = await Casting.countDocuments(query);


        // Return the response with the fetched items
        return res.status(200).json({
            status: 'success',
            data: castingData,
            count: totalCount
        });
    } catch (error) {
        console.error('Error fetching items:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'An error occurred while fetching the items.',
        });
    }
})
////

exports.CastingDigitalForm = catchAsync(async (req, res, next) => {
    const { no, type } = req.body;

    const formNumber = Number(no);
    if (!no || isNaN(formNumber)) {
        return next(new AppError('formNumber must be a valid number.', 400));
    }

    const allowedTypes = ['rv', 'miv', 'mrv'];
    const requestType = type?.toLowerCase();
    if (!requestType || !allowedTypes.includes(requestType)) {
        return next(new AppError('Invalid request type. Allowed types: rv, miv, mrv.', 400));
    }

    const query = {
        RequestNo: formNumber, // use String(formNumber) if stored as string
    };

    console.log("Querying DB with:", query);

    // Get all records matching the form number
    const allCastingData = await Casting.find(query);

    if (!allCastingData || allCastingData.length === 0) {
        return next(new AppError(`No data found for form number ${formNumber}.`, 404));
    }

    // Find one specific record matching both form number and type
    const specificCastingData = await Casting.findOne({
        RequestNo: formNumber,
        RequestType: { $regex: new RegExp(`^${requestType}$`, 'i') } // case-insensitive match
    });

    if (!specificCastingData) {
        return next(new AppError(`Form number ${formNumber} does not match request type ${type.toUpperCase()}.`, 400));
    }

    return res.status(200).json({
        status: 'success',
        matched: specificCastingData,     // One record matching both RequestNo and RequestType
        data: allCastingData,             // All records matching RequestNo
        count: allCastingData.length,
    });
});





//get requsition folder images
exports.requstionImage = catchAsync(async (req, res, next) => {
    const folderPath = path.join(__dirname, '../public/img/requisitionform'); // add "../" if not already in root

    fs.readdir(folderPath, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read folder' });

        const images = files.filter(file =>
            /\.(jpe?g|png|gif)$/i.test(file)
        );

        res.json(images);
    });
});


// delete requsition folder image

exports.deleteRequisitionImage = catchAsync(async (req, res, next) => {
    const { filename } = req.params;

    if (!filename) {
        return next(new AppError('Filename is required', 400));
    }

    const filePath = path.join(__dirname, '../public/img/requisitionform', filename);

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            return next(new AppError('File does not exist', 404));
        }

        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
                return next(new AppError('Failed to delete the image', 500));
            }

            res.status(200).json({
                status: 'success',
                message: `${filename} deleted successfully`
            });
        });
    });
});

//download requiton folder images
exports.downloadAllImages = catchAsync(async (req, res, next) => {
    const folderPath = path.join(__dirname, '../public/img/requisitionform');

    res.setHeader('Content-Disposition', 'attachment; filename=requisition_images.zip');
    res.setHeader('Content-Type', 'application/zip');

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', err => res.status(500).send({ error: err.message }));
    archive.pipe(res);

    fs.readdir(folderPath, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read folder' });

        const imageFiles = files.filter(file => /\.(jpe?g|png|gif)$/i.test(file));

        console.log('Image files found:', imageFiles);

        imageFiles.forEach(file => {
            const filePath = path.join(folderPath, file);
            archive.file(filePath, { name: file });
        });

        archive.finalize(); // send response after adding all files
    });
});






