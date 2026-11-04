import mongoose from 'mongoose';
import { MAX_TAGS, MAX_TAG_LENGTH, PRIORITIES } from '../constants.js';
import { workflow } from '../workflow/index.js';

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: MAX_TAG_LENGTH }],
      default: [],
      validate: { validator: (tags) => tags.length <= MAX_TAGS, message: 'Too many tags' },
    },

    columnId: { type: String, enum: workflow.ids, required: true },
    orderIndex: { type: Number, required: true },

    version: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

taskSchema.index({ columnId: 1, orderIndex: 1 });

taskSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

export const Task = mongoose.model('Task', taskSchema);
