
const VechileCategory = require('../models/vechileCatModel');
const factory = require('./handlerFactory');


exports.createCategory = factory.createOne(VechileCategory)

exports.getCategoryById = factory.getOne(VechileCategory);
exports.getAllCategory = factory.getAll(VechileCategory);

exports.updateCategoryById = factory.updateOne(VechileCategory);
exports.deleteCategoryById = factory.deleteOne(VechileCategory);
