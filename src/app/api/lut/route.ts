import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const LUT_DIR = join(process.cwd(), ".luts");

// POST /api/lut — upload a .cube file, then import to camera
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const cameraId = formData.get("cameraId") as string | null;
  const slot = parseInt(formData.get("slot") as string || "1");
  const port = formData.get("port") as string || "8080";

  if (!file || !cameraId) {
    return NextResponse.json({ success: false, message: "file and cameraId required" }, { status: 400 });
  }

  if (!file.name.endsWith(".cube")) {
    return NextResponse.json({ success: false, message: "Only .cube files supported" }, { status: 400 });
  }

  // Save file to disk
  if (!existsSync(LUT_DIR)) await mkdir(LUT_DIR, { recursive: true });
  const filePath = join(LUT_DIR, file.name);
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  // Forward to camera server
  const res = await fetch(`http://localhost:${port}/api/cameras/${cameraId}/lut/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, slot }),
  });
  const data = await res.json();

  return NextResponse.json({ ...data, fileName: file.name, filePath });
}

// GET /api/lut — list uploaded .cube files
export async function GET() {
  if (!existsSync(LUT_DIR)) {
    return NextResponse.json({ files: [] });
  }
  const files = (await readdir(LUT_DIR)).filter((f) => f.endsWith(".cube"));
  return NextResponse.json({ files });
}

// PUT /api/lut — re-apply an existing .cube file to camera
export async function PUT(req: NextRequest) {
  const formData = await req.formData();
  const fileName = formData.get("fileName") as string | null;
  const cameraId = formData.get("cameraId") as string | null;
  const slot = parseInt(formData.get("slot") as string || "1");

  if (!fileName || !cameraId) {
    return NextResponse.json({ success: false, message: "fileName and cameraId required" }, { status: 400 });
  }

  const filePath = join(LUT_DIR, fileName);
  if (!existsSync(filePath)) {
    return NextResponse.json({ success: false, message: "File not found" }, { status: 404 });
  }

  const res = await fetch(`http://localhost:8080/api/cameras/${cameraId}/lut/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, slot }),
  });
  const data = await res.json();

  return NextResponse.json({ ...data, fileName, slot });
}

// DELETE /api/lut — delete a .cube file
export async function DELETE(req: NextRequest) {
  const { fileName } = await req.json();
  if (!fileName) {
    return NextResponse.json({ success: false, message: "fileName required" }, { status: 400 });
  }
  const filePath = join(LUT_DIR, fileName);
  if (existsSync(filePath)) {
    await unlink(filePath);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, message: "File not found" }, { status: 404 });
}
