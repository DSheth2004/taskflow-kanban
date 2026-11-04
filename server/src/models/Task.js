import mongoose from 'mongoose';
import { PRIORITIES } from '../constants.js';
import { workflow } from '../workflow/index.js';

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    // The workflow state the task is in; one board column per state.
    columnId: { type: String, enum: workflow.ids, required: true },
    orderIndex: { type: Number, required: true },
    // Bumped on every write. Writes are conditional on the version the client last saw,
    // so a stale request matches zero documents and becomes a 409 instead of a silent overwrite.
    version: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

// Serves both "load the board" (sorted by column, then position) and neighbour lookups.
taskSchema.index({ columnId: 1, orderIndex: 1 });

taskSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

export const Task = mongoose.model('Task', taskSchema);
