const express = require('express');
const validate = require('../../middlewares/validate');
const professionalsValidation = require('../../validations/professionals.validation');
const professionalsController = require('../../controllers/professionals.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

router.get(
  '/',
  auth('system'),
  validate(professionalsValidation.getProfessionals),
  professionalsController.getProfessionals
);

router.post(
  '/',
  auth('system'),
  validate(professionalsValidation.createProfessional),
  professionalsController.createProfessional
);

router.put(
  '/:id',
  auth('system'),
  validate(professionalsValidation.updateProfessional),
  professionalsController.updateProfessional
);

router.patch(
  '/:id/status',
  auth('system'),
  validate(professionalsValidation.toggleProfessionalStatus),
  professionalsController.toggleProfessionalStatus
);

router.delete(
  '/:id',
  auth('system'),
  validate(professionalsValidation.deleteProfessional),
  professionalsController.deleteProfessional
);

module.exports = router;
