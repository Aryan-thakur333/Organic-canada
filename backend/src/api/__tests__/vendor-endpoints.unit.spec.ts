import { POST as loginPOST } from "../vendor/login/route";
import { POST as registerPOST } from "../vendor/register/route";
import { GET as meGET } from "../vendor/me/route";
import { VENDOR_MODULE } from "../../modules/vendor";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

jest.mock("../vendor/auth", () => ({
  comparePassword: (pw: string, hash: string) => pw === "correct_password",
  hashPassword: (pw: string) => "hashed_" + pw,
  signToken: (vendorId: string) => "token_" + vendorId,
}));

const mockVendor = {
  id: "vendor_1",
  name: "John Doe",
  store_name: "John's Shop",
  email: "vendor@gmail.com",
  phone: "12345678",
  status: "active",
  password_hash: "$2b$10$abcdefghijklmnopqrstuv"
};

const mockVendorService = {
  listVendors: jest.fn(),
  createVendors: jest.fn(),
  updateVendors: jest.fn()
};

const mockReqWithScope = (body: any = {}, vendorOverride?: any) => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return {
    body,
    vendor: vendorOverride,
    scope: {
      resolve: (token: string) => {
        if (token === VENDOR_MODULE) {
          return mockVendorService;
        }
        if (token === "logger") {
          return logger;
        }
      }
    }
  } as unknown as MedusaRequest;
};

function mockRes(): MedusaResponse {
  let statusCode = 200;
  let body: any = null;
  const res = {
    status: jest.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: jest.fn((data: any) => { body = data }),
    setHeader: jest.fn(),
    get statusCode() { return statusCode },
    get body() { return body },
  };
  return res as unknown as MedusaResponse;
}

describe("Vendor Endpoints Auth & Session Validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("1. valid vendor login", async () => {
    const req = mockReqWithScope({ email: "vendor@gmail.com", password: "correct_password" });
    const res = mockRes();
    
    mockVendorService.listVendors.mockResolvedValueOnce([mockVendor]);
    
    await loginPOST(req, res);
    
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: "Login successful",
      token: "token_vendor_1",
      vendor: expect.objectContaining({ email: "vendor@gmail.com" })
    }));
  });

  test("2. invalid password → 401", async () => {
    const req = mockReqWithScope({ email: "vendor@gmail.com", password: "wrong_password" });
    const res = mockRes();
    
    mockVendorService.listVendors.mockResolvedValueOnce([mockVendor]);
    
    await loginPOST(req, res);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: "Invalid email or password"
    }));
  });

  test("3. unknown email → 401", async () => {
    const req = mockReqWithScope({ email: "unknown@gmail.com", password: "correct_password" });
    const res = mockRes();
    
    mockVendorService.listVendors.mockResolvedValueOnce([]);
    
    await loginPOST(req, res);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: "Invalid email or password"
    }));
  });

  test("4. existing email register → 400", async () => {
    const req = mockReqWithScope({
      email: "vendor@gmail.com",
      password: "correct_password",
      business_name: "My Business",
      owner_name: "My Owner"
    });
    const res = mockRes();
    
    mockVendorService.listVendors.mockResolvedValueOnce([mockVendor]);
    
    await registerPOST(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: "Email already registered"
    }));
  });

  test("5. current vendor endpoint returns authenticated vendor", async () => {
    const req = mockReqWithScope({}, mockVendor);
    const res = mockRes();
    
    await meGET(req, res);
    
    expect(res.json).toHaveBeenCalledWith({
      vendor: {
        id: mockVendor.id,
        store_name: mockVendor.store_name,
        business_name: mockVendor.store_name,
        name: mockVendor.name,
        email: mockVendor.email,
        phone: mockVendor.phone,
        status: mockVendor.status,
      }
    });
  });

  test("6. unauthorized current vendor endpoint → 401", async () => {
    const req = mockReqWithScope({}, null);
    const res = mockRes();
    
    await meGET(req, res);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Not authenticated"
    });
  });

  test("7. pending vendor login returns 403 status and message", async () => {
    const pendingVendor = { ...mockVendor, status: "pending" };
    const req = mockReqWithScope({ email: "vendor@gmail.com", password: "correct_password" });
    const res = mockRes();
    
    mockVendorService.listVendors.mockResolvedValueOnce([pendingVendor]);
    
    await loginPOST(req, res);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: "Vendor account pending admin approval.",
      status: "pending"
    }));
  });

  test("7b. suspended vendor login returns 403 status and message", async () => {
    const suspendedVendor = { ...mockVendor, status: "suspended" };
    const req = mockReqWithScope({ email: "vendor@gmail.com", password: "correct_password" });
    const res = mockRes();
    
    mockVendorService.listVendors.mockResolvedValueOnce([suspendedVendor]);
    
    await loginPOST(req, res);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: "Your vendor account has been suspended. Please contact support.",
      status: "suspended"
    }));
  });
});
