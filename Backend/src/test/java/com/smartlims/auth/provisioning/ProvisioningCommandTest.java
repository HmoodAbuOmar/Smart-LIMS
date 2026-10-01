package com.smartlims.auth.provisioning;

import com.smartlims.SmartLimsApplication;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import static org.mockito.Mockito.*;

class ProvisioningCommandTest {
    @Test
    void normalStartupNeverInvokesProvisioningAndExplicitCommandDoes() {
        try (var provisioning = mockStatic(FirstAdministratorCommand.class);
             var boot = mockStatic(SpringApplication.class)) {
            String[] normal = {};
            SmartLimsApplication.main(normal);
            boot.verify(() -> SpringApplication.run(SmartLimsApplication.class, normal));
            provisioning.verifyNoInteractions();
            String[] command = {"--provision-first-admin"};
            SmartLimsApplication.main(command);
            provisioning.verify(() -> FirstAdministratorCommand.run(command));
            boot.verifyNoMoreInteractions();
        }
    }
}
