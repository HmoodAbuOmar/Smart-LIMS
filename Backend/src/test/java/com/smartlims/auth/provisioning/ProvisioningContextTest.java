package com.smartlims.auth.provisioning;

import com.smartlims.IsolatedPostgresTest;
import com.smartlims.auth.email.VerificationEmailSender;
import com.smartlims.auth.service.AccountManagementService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class ProvisioningContextTest extends IsolatedPostgresTest {
    @Autowired ApplicationContext context;
    @MockitoBean VerificationEmailSender email;

    @Test
    void commandCanInitializeNonWebServicesWithoutAutomaticProvisioning() {
        assertNotNull(context.getBean(AccountManagementService.class));
        assertFalse(context.containsBean("securityFilterChain"));
        verifyNoInteractions(email);
    }
}
