const Subcategory = require('../models/subCategoryModel');
const factory = require('./handlerFactory');


exports.createCategory = factory.createOne(Subcategory)

exports.getCategoryById = factory.getOne(Subcategory);
exports.getAllCategory = factory.getAll(Subcategory);

exports.updateCategoryById = factory.updateOne(Subcategory);
exports.deleteCategoryById = factory.deleteOne(Subcategory);
