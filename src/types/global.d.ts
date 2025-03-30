import { Server } from "http";

declare global {
  var httpServer: Server;

  namespace NodeJS {
    interface Global {
      httpServer: Server;
    }
  }
}
