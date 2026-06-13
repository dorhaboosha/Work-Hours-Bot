import "dotenv/config";
import { Env } from "@/config/Env";
import app from "@/app";

app.listen(Env.PORT, () => {
  console.log(`Server running on port ${Env.PORT} [${Env.NODE_ENV}]`);
});
