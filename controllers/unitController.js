
const Unit = require('../models/unitModel');
const factory = require('./handlerFactory');


exports.createUnit = factory.createOne(Unit)

exports.getUnitById = factory.getOne(Unit);
exports.getAllUnit = factory.getAll(Unit);

exports.updateUnitById = factory.updateOne(Unit);
exports.deleteUnitById = factory.deleteOne(Unit);
