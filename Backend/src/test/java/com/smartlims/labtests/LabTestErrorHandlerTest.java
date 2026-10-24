package com.smartlims.labtests;

import com.smartlims.labtests.controller.LabTestController;
import com.smartlims.labtests.exception.LabTestErrorHandler;
import com.smartlims.labtests.service.LabTestService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LabTestErrorHandlerTest {
    private final MockMvc mvc = MockMvcBuilders
            .standaloneSetup(new LabTestController(mock(LabTestService.class)))
            .setControllerAdvice(new LabTestErrorHandler()).build();

    @Test
    void queryErrorsUseFieldErrorsAndMatchingRequestId() throws Exception {
        var response = mvc.perform(get("/api/lab-tests").param("size", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.size").exists())
                .andExpect(jsonPath("$.fields").doesNotExist())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().exists("X-Request-Id")).andReturn().getResponse();
        var body = tools.jackson.databind.json.JsonMapper.builder().build()
                .readTree(response.getContentAsString());
        assertEquals(response.getHeader("X-Request-Id"), body.get("requestId").asString());
    }

    @Test
    void bodyValidationUsesFieldErrors() throws Exception {
        mvc.perform(post("/api/lab-tests").contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"CBC\",\"name\":\"CBC\",\"price\":1.001,\"sampleType\":\"Blood\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.price").value("Invalid value."))
                .andExpect(jsonPath("$.fields").doesNotExist());
    }

    @Test
    void unsupportedMethodsAndMediaTypesKeepTheirHttpStatuses() throws Exception {
        mvc.perform(delete("/api/lab-tests/test")).andExpect(status().isMethodNotAllowed());
        mvc.perform(post("/api/lab-tests").contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void malformedJsonHasEmptyFieldErrors() throws Exception {
        mvc.perform(patch("/api/lab-tests/test/status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"active\":\"false\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_JSON"))
                .andExpect(jsonPath("$.fieldErrors").isMap())
                .andExpect(jsonPath("$.fieldErrors").isEmpty())
                .andExpect(jsonPath("$.fields").doesNotExist());
    }
}
