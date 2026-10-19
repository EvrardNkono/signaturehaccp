import { HydratedDocument } from "mongoose";
import { IAlert, IDocument, IEquipment, IEstablishment, ILot, IReading, IUser, IOilControl } from "../models";
import { equipmentStatus } from "../domain/equipment";
import { computeEscalation, escalationReason } from "../domain/alerts";
import { daysUntil, getDlcStatus } from "../domain/traceability";
import { daysUntilExpiry, expiryStatus } from "../domain/documents";

const iso = (d?: Date | null) => (d ? d.toISOString() : undefined);

export function presentEquipment(e: HydratedDocument<IEquipment> | IEquipment) {
  const sensor = e.sensor
    ? {
        battery: e.sensor.battery,
        signal: e.sensor.signal,
        online: e.sensor.online,
        pairing: e.sensor.pairing,
        lastSeenAt: iso(e.sensor.lastSeenAt),
      }
    : null;
  return {
    id: String(e._id),
    establishmentId: String(e.establishmentId),
    name: e.name,
    type: e.type,
    zone: e.zone,
    temp: e.temp ?? null,
    min: e.min,
    max: e.max,
    warnMargin: e.warnMargin,
    sensor,
    lastReadingAt: iso(e.lastReadingAt) ?? null,
    history: e.recentValues ?? [],
    status: equipmentStatus({ temp: e.temp ?? null, min: e.min, max: e.max, warnMargin: e.warnMargin, sensor }),
    archived: e.archived,
    archivedAt: iso(e.archivedAt),
    deleteReason: e.deleteReason,
    deleteNote: e.deleteNote,
    deletedBy: e.deletedBy,
  };
}

export function presentAlert(a: HydratedDocument<IAlert> | IAlert, now = new Date()) {
  const escalation = computeEscalation(a, now);
  return {
    id: String(a._id),
    establishmentId: String(a.establishmentId),
    severity: a.severity,
    kind: a.kind,
    state: a.state,
    title: a.title,
    detail: a.detail,
    equipment: a.equipmentName,
    equipmentId: a.equipmentId ? String(a.equipmentId) : undefined,
    zone: a.zone,
    value: a.value,
    threshold: a.threshold,
    correctiveAction: a.correctiveAction,
    createdAt: a.createdAt.toISOString(),
    takenAt: iso(a.takenAt),
    takenBy: a.takenBy,
    resolvedAt: iso(a.resolvedAt),
    resolvedBy: a.resolvedBy,
    escalation,
    escalationReason: escalationReason(a, escalation, now),
  };
}

export function presentReading(r: HydratedDocument<IReading> | IReading) {
  return {
    id: String(r._id),
    establishmentId: String(r.establishmentId),
    equipmentId: String(r.equipmentId),
    equipmentName: r.equipmentName,
    value: r.value,
    status: r.status,
    source: r.source,
    by: r.by,
    action: r.action,
    at: r.at.toISOString(),
  };
}

export function presentOilControl(c: HydratedDocument<IOilControl> | IOilControl) {
  return {
    id: String(c._id),
    establishmentId: String(c.establishmentId),
    fryerId: String(c.fryerId),
    fryerName: c.fryerName,
    slot: c.slot,
    dayKey: c.dayKey,
    temp: c.temp,
    polar: c.polar,
    aspect: c.aspect,
    status: c.status,
    by: c.by,
    action: c.action,
    at: c.at.toISOString(),
  };
}

export function presentLot(l: HydratedDocument<ILot> | ILot, today: string, soonDays: number) {
  const days = daysUntil(l.dlc, today);
  return {
    id: String(l._id),
    establishmentId: String(l.establishmentId),
    product: l.product,
    supplier: l.supplier,
    lotNumber: l.lotNumber,
    category: l.category,
    quantity: l.quantity,
    receivedAt: l.receivedAt,
    dlc: l.dlc,
    receptionTemp: l.receptionTemp ?? null,
    note: l.note,
    state: l.state,
    closedAt: l.closedAt,
    daysLeft: days,
    dlcStatus: l.state === "stock" ? getDlcStatus(days, soonDays) : null,
  };
}

export function presentDocument(d: HydratedDocument<IDocument> | IDocument, now = new Date()) {
  return {
    id: String(d._id),
    establishmentId: String(d.establishmentId),
    name: d.name,
    category: d.category,
    description: d.description,
    fileName: d.fileName,
    fileSize: d.fileSize,
    fileType: d.fileType,
    uploadedAt: d.uploadedAt.toISOString(),
    uploadedBy: d.uploadedBy,
    expiresAt: iso(d.expiresAt),
    expiryStatus: expiryStatus(d.expiresAt, now),
    daysUntilExpiry: daysUntilExpiry(d.expiresAt, now),
    tags: d.tags,
    archived: d.archived,
    archivedAt: iso(d.archivedAt),
    deleteReason: d.deleteReason,
    deletedBy: d.deletedBy,
    downloadUrl: `/api/v1/establishments/${d.establishmentId}/documents/${d._id}/file`,
  };
}

export function presentUser(u: HydratedDocument<IUser> | IUser) {
  return {
    id: String(u._id),
    companyId: String(u.companyId),
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role,
    primaryEstablishmentId: u.primaryEstablishmentId ? String(u.primaryEstablishmentId) : undefined,
    authorizedEstablishmentIds: (u.authorizedEstablishmentIds ?? []).map(String),
    active: u.active,
    lastSeen: iso(u.lastSeenAt),
    mustChangePassword: u.mustChangePassword,
  };
}

export function presentEstablishment(e: HydratedDocument<IEstablishment> | IEstablishment) {
  return {
    id: String(e._id),
    companyId: String(e.companyId),
    name: e.name,
    city: e.city,
    address: e.address,
    zip: e.zip,
    phone: e.phone,
    email: e.email,
    siret: e.siret,
    manager: e.manager,
    timezone: e.timezone,
    active: e.active,
  };
}
