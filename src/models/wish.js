import { DataTypes, Model } from "sequelize";

import { env } from "../config/env.js";
import { sequelize } from "../db/index.js";

export class Wish extends Model {
  /** Shape the web client expects (`Wish` in web/src/lib/wish.ts). */
  toClient() {
    return {
      id: this.id,
      name: this.name,
      message: this.message,
      image: `${env.publicUrl}/uploads/${this.filename}`,
      width: this.width,
      height: this.height,
      createdAt: this.createdAt.getTime(),
    };
  }
}

Wish.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(48), allowNull: false },
    message: { type: DataTypes.STRING(220), allowNull: false },
    /** Only the stored file name — the public URL is built on read, so moving
     *  the server to another domain never invalidates existing rows. */
    filename: { type: DataTypes.STRING(80), allowNull: false },
    width: { type: DataTypes.INTEGER, allowNull: false },
    height: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    modelName: "Wish",
    tableName: "wishes",
    updatedAt: false,
    indexes: [{ fields: ["createdAt"] }],
  },
);
