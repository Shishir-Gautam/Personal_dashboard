import { Schema, model, models, Model, Types } from 'mongoose'

export interface TreeDoc {
  _id: Types.ObjectId
  slug: string
  title: string
  kind: 'project' | 'life' | 'course'
  proposed: Types.DocumentArray<{ title?: string; why?: string; at: Date }>
  createdAt: Date
  updatedAt: Date
}

export interface NodeDoc {
  _id: Types.ObjectId
  treeId: Types.ObjectId
  title: string
  why: string
  status: 'locked' | 'available' | 'in_progress' | 'done'
  progress: number
  nextAction: string
  reviewDue?: Date
  position?: { x?: number; y?: number }
  prereqs: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

export interface UpdateDoc {
  _id: Types.ObjectId
  nodeId?: Types.ObjectId
  treeId: Types.ObjectId
  sessionId?: string
  summary: string
  delta: number
  source: 'session' | 'manual'
  createdAt: Date
  updatedAt: Date
}

export interface IntentDoc {
  _id: Types.ObjectId
  nodeId?: Types.ObjectId
  treeId: Types.ObjectId
  directive: string
  status: 'pending' | 'delivered' | 'done'
  deliveredAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface ReflectionDoc {
  _id: Types.ObjectId
  weekStart: Date
  body: string
  createdAt: Date
  updatedAt: Date
}

export interface CredentialDoc {
  _id: Types.ObjectId
  credId: string
  publicKey: string
  counter: number
  transports: string[]
  owner: string
  createdAt: Date
  updatedAt: Date
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- explicit <any> keeps schema type inference cheap (unannotated inference is what caused the tsc OOM)
const TreeSchema: Schema = new Schema<any>({
  slug: { type: String, unique: true, required: true },
  title: { type: String, required: true },
  kind: { type: String, enum: ['project', 'life', 'course'], required: true },
  proposed: [{ title: String, why: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- explicit <any> keeps schema type inference cheap (unannotated inference is what caused the tsc OOM)
const NodeSchema: Schema = new Schema<any>({
  treeId: { type: Schema.Types.ObjectId, ref: 'Tree', index: true, required: true },
  title: { type: String, required: true },
  why: { type: String, default: '' },
  status: { type: String, enum: ['locked', 'available', 'in_progress', 'done'], default: 'locked' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  nextAction: { type: String, default: '' },
  reviewDue: Date,
  position: { x: Number, y: Number },
  prereqs: [{ type: Schema.Types.ObjectId, ref: 'TreeNode' }],
}, { timestamps: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- explicit <any> keeps schema type inference cheap (unannotated inference is what caused the tsc OOM)
const UpdateSchema: Schema = new Schema<any>({
  nodeId: { type: Schema.Types.ObjectId, ref: 'TreeNode', index: true },
  treeId: { type: Schema.Types.ObjectId, ref: 'Tree', index: true, required: true },
  sessionId: String,
  summary: { type: String, required: true },
  delta: { type: Number, default: 0 },
  source: { type: String, enum: ['session', 'manual'], default: 'session' },
}, { timestamps: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- explicit <any> keeps schema type inference cheap (unannotated inference is what caused the tsc OOM)
const IntentSchema: Schema = new Schema<any>({
  nodeId: { type: Schema.Types.ObjectId, ref: 'TreeNode' },
  treeId: { type: Schema.Types.ObjectId, ref: 'Tree', index: true, required: true },
  directive: { type: String, required: true },
  status: { type: String, enum: ['pending', 'delivered', 'done'], default: 'pending' },
  deliveredAt: Date,
}, { timestamps: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- explicit <any> keeps schema type inference cheap (unannotated inference is what caused the tsc OOM)
const ReflectionSchema: Schema = new Schema<any>({
  weekStart: { type: Date, unique: true, required: true },
  body: { type: String, required: true },
}, { timestamps: true })

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- explicit <any> keeps schema type inference cheap (unannotated inference is what caused the tsc OOM)
const CredentialSchema: Schema = new Schema<any>({
  credId: { type: String, unique: true, required: true },
  publicKey: { type: String, required: true }, // base64url-encoded
  counter: { type: Number, default: 0 },
  transports: [String],
  // Constant singleton key: this app supports exactly one passkey. The unique
  // index turns concurrent registrations into a DB-enforced race instead of a
  // TOCTOU-prone countDocuments() check.
  owner: { type: String, default: 'owner', unique: true },
}, { timestamps: true })

const m = <T = unknown>(name: string, schema: Schema, coll?: string): Model<T> =>
  (models[name] ?? model(name, schema, coll)) as Model<T>

export const Tree = m<TreeDoc>('Tree', TreeSchema)
export const TreeNode = m<NodeDoc>('TreeNode', NodeSchema, 'nodes')
export const Update = m<UpdateDoc>('Update', UpdateSchema)
export const Intent = m<IntentDoc>('Intent', IntentSchema)
export const Reflection = m<ReflectionDoc>('Reflection', ReflectionSchema)
export const Credential = m<CredentialDoc>('Credential', CredentialSchema)
