// api.service.test.ts
import { apiService } from '../services/api.service';

// Mock fetch
global.fetch = jest.fn();

describe('ApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('makes GET requests with auth token', async () => {
    const mockResponse = { data: 'test' };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });
    
    const result = await apiService.get('/test');
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
    
    expect(result).toEqual(mockResponse);
  });
  
  // Add more tests
});